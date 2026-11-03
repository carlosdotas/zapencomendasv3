package com.zapencomendas.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Log;
import org.json.JSONObject;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class MainActivity extends BridgeActivity {

    private static final String TAG = "EncomendasZapMain";
    private static final int FOREGROUND_PERMISSION_CODE = 1001;
    private static final int BACKGROUND_LOCATION_CODE = 1002;
    private static final int MEDIA_PERMISSION_CODE = 1003;
    private static final int PICK_CONTACT_REQUEST = 2001;

    private String pendingSharedMapJson = null;

    public String getLastSharedMapJson() {
        return pendingSharedMapJson;
    }

    public void clearLastSharedMapJson() {
        pendingSharedMapJson = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIncomingIntent(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        showSystemBars();
        setupBackButtonHandler();
        setupWebView();
        requestInitialPermissions();
        checkGpsEnabled();
        ensureLocationServiceRunning();
        handleIncomingIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        showSystemBars();
        ensureLocationServiceRunning();
        // Garantir que os temporizadores JS continuem ativos
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().resumeTimers();
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        // Não pausa os temporizadores JS em segundo plano para manter envio de localização do site
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().resumeTimers();
        }
    }

    @Override
    public void onStop() {
        super.onStop();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().resumeTimers();
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            showSystemBars();
        }
    }

    private void showSystemBars() {
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);

        int brandColor = Color.parseColor("#002B49");
        getWindow().setStatusBarColor(brandColor);
        getWindow().setNavigationBarColor(brandColor);
        getWindow().setBackgroundDrawable(new ColorDrawable(brandColor));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());

        if (controller != null) {
            controller.show(WindowInsetsCompat.Type.systemBars());
            // Ícones claros (brancos) na barra de status e barra de navegação sobre o fundo escuro #002B49
            controller.setAppearanceLightStatusBars(false);
            controller.setAppearanceLightNavigationBars(false);
        }

        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);

        // Aplica o padding exato das barras de sistema (inclusive a barra inferior de navegação)
        // com o fundo exatamente na cor da marca para não ficar nenhuma borda branca
        View contentView = findViewById(android.R.id.content);
        if (contentView != null) {
            contentView.setBackgroundColor(brandColor);
            ViewCompat.setOnApplyWindowInsetsListener(contentView, (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                v.setPadding(insets.left, insets.top, insets.right, insets.bottom);
                return windowInsets;
            });
            ViewCompat.requestApplyInsets(contentView);
        }
    }

    private long lastBackPressTime = 0;

    private void setupBackButtonHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                handleBrowserBack();
            }
        });
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) {
            handleBrowserBack();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    private void handleBrowserBack() {
        if (getBridge() == null || getBridge().getWebView() == null) {
            moveTaskToBack(true);
            return;
        }

        WebView webView = getBridge().getWebView();

        // 1. Tenta voltar pelo histórico nativo da WebView
        if (webView.canGoBack()) {
            webView.goBack();
            return;
        }

        // 2. Tenta voltar pelo histórico do navegador web (Single Page Application / rotas JS)
        webView.evaluateJavascript(
            "(function() { " +
            "  if (window.history && window.history.length > 1) { " +
            "    window.history.back(); " +
            "    return 'BACK'; " +
            "  } " +
            "  return 'ROOT'; " +
            "})()",
            result -> {
                if (result != null && result.contains("BACK")) {
                    // Voltou no histórico do navegador web com sucesso
                    return;
                }

                // Se já estiver na tela inicial do sistema, pede confirmação antes de sair
                long currentTime = System.currentTimeMillis();
                if (currentTime - lastBackPressTime < 2500) {
                    moveTaskToBack(true);
                } else {
                    lastBackPressTime = currentTime;
                    Toast.makeText(MainActivity.this, "Pressione 'Voltar' novamente para sair", Toast.LENGTH_SHORT).show();
                }
            }
        );
    }

    private void setupWebView() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            WebView webView = getBridge().getWebView();
            WebSettings settings = webView.getSettings();
            settings.setJavaScriptEnabled(true);
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            settings.setAllowFileAccess(true);
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);

            // Enable Geolocation for Maps & Tracking
            settings.setGeolocationEnabled(true);
            settings.setGeolocationDatabasePath(getFilesDir().getPath());

            // Expose Native Android Bridge to the web application
            webView.addJavascriptInterface(new WebAppInterface(this), "AndroidApp");

            // BridgeWebViewClient injects bridge helper script on every page load
            BridgeWebViewClient webViewClient = new BridgeWebViewClient(getBridge()) {
                @Override
                public void onPageFinished(WebView view, String url) {
                    super.onPageFinished(view, url);
                    injectNativeBridge(view);
                }
            };
            webView.setWebViewClient(webViewClient);

            // Auto-accept geolocation for all origins and persist permission permanently
            webView.setWebChromeClient(new BridgeWebChromeClient(getBridge()) {
                @Override
                public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                    // Aceita sempre a permissão de geolocalização permanentemente (retain = true)
                    Log.d(TAG, "onGeolocationPermissionsShowPrompt auto-aceito para: " + origin);
                    callback.invoke(origin, true, true);
                }

                // getUserMedia (câmera/microfone no site): concede após garantir as permissões do Android
                @Override
                public void onPermissionRequest(final android.webkit.PermissionRequest request) {
                    runOnUiThread(() -> {
                        List<String> needed = new ArrayList<>();
                        for (String res : request.getResources()) {
                            if (android.webkit.PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.CAMERA);
                            }
                            if (android.webkit.PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                                && ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                                needed.add(Manifest.permission.RECORD_AUDIO);
                            }
                        }
                        if (!needed.isEmpty()) {
                            ActivityCompat.requestPermissions(MainActivity.this, needed.toArray(new String[0]), MEDIA_PERMISSION_CODE);
                        }
                        request.grant(request.getResources());
                    });
                }
            });
        }
    }

    private void injectNativeBridge(WebView view) {
        String js =
            "(function() { " +
            "  if (window.__zapBridgeInjected) return; " +
            "  window.__zapBridgeInjected = true; " +
            "  window.isNativeApp = true; " +
            "  " +
            "  /* Injeta CSS de safe-areas e desativa highlight azul/cinza */ " +
            "  var style = document.createElement('style'); " +
            "  style.innerHTML = ':root { --sat: env(safe-area-inset-top, 0px); --sab: env(safe-area-inset-bottom, 0px); } body { overscroll-behavior-y: contain; -webkit-tap-highlight-color: transparent; }'; " +
            "  if (document.head) document.head.appendChild(style); " +
            "  " +
            "  /* Polyfill de Notificações Web para Notificações Android Nativas */ " +
            "  if (window.AndroidApp) { " +
            "    window.Notification = function(title, options) { " +
            "      options = options || {}; " +
            "      window.AndroidApp.showNotification(title, options.body || ''); " +
            "    }; " +
            "    window.Notification.permission = 'granted'; " +
            "    window.Notification.requestPermission = function(cb) { " +
            "      if (cb) cb('granted'); " +
            "      return Promise.resolve('granted'); " +
            "    }; " +
            "  } " +
            "  " +
            "  /* Polyfill da Agenda de Contatos (Web Contacts Picker API) */ " +
            "  if (!navigator.contacts) { " +
            "    navigator.contacts = { " +
            "      select: function(props, opts) { " +
            "        return new Promise(function(resolve, reject) { " +
            "          var handler = function(e) { " +
            "            window.removeEventListener('contactSelected', handler); " +
            "            resolve([e.detail]); " +
            "          }; " +
            "          window.addEventListener('contactSelected', handler); " +
            "          if (window.AndroidApp && window.AndroidApp.pickContact) { " +
            "            window.AndroidApp.pickContact(); " +
            "          } else { " +
            "            window.removeEventListener('contactSelected', handler); " +
            "            reject(new Error('Agenda não disponível')); " +
            "          } " +
            "        }); " +
            "      }, " +
            "      getProperties: function() { " +
            "        return Promise.resolve(['name', 'tel']); " +
            "      } " +
            "    }; " +
            "  } " +
            "  " +
            "  /* Listener de popstate para fechar modais/drawers abertos com o botao voltar */ " +
            "  window.addEventListener('popstate', function() { " +
            "    var closeButtons = document.querySelectorAll('[aria-label=\"Close\"], [aria-label=\"Fechar\"], .modal-close, button.close'); " +
            "    if (closeButtons.length > 0) { " +
            "      var lastClose = closeButtons[closeButtons.length - 1]; " +
            "      if (lastClose && typeof lastClose.click === 'function') lastClose.click(); " +
            "    } " +
            "  }); " +
            "})();";
        view.evaluateJavascript(js, null);

        if (pendingSharedMapJson != null) {
            dispatchSharedMapToWeb(pendingSharedMapJson);
        }
    }

    public void openContactPicker() {
        try {
            Intent pickContactIntent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(pickContactIntent, PICK_CONTACT_REQUEST);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao abrir agenda de contatos: " + e.getMessage());
        }
    }

    public void saveContactToAgenda(String name, String phone) {
        try {
            Intent intent = new Intent(Intent.ACTION_INSERT);
            intent.setType(ContactsContract.RawContacts.CONTENT_TYPE);
            intent.putExtra(ContactsContract.Intents.Insert.NAME, name);
            intent.putExtra(ContactsContract.Intents.Insert.PHONE, phone);
            startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao salvar contato na agenda: " + e.getMessage());
        }
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (requestCode == PICK_CONTACT_REQUEST && resultCode == RESULT_OK && data != null) {
            Uri contactUri = data.getData();
            if (contactUri == null) return;

            String[] projection = new String[]{
                ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                ContactsContract.CommonDataKinds.Phone.NUMBER
            };

            try (Cursor cursor = getContentResolver().query(contactUri, projection, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                    int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                    String name = nameIndex != -1 ? cursor.getString(nameIndex) : "";
                    String number = numberIndex != -1 ? cursor.getString(numberIndex) : "";

                    String js = String.format(
                        "(function() { " +
                        "  var detail = { name: %s, phone: %s }; " +
                        "  if (window.onContactSelected) window.onContactSelected(detail); " +
                        "  window.dispatchEvent(new CustomEvent('contactSelected', { detail: detail })); " +
                        "})();",
                        JSONObject.quote(name),
                        JSONObject.quote(number)
                    );
                    if (getBridge() != null && getBridge().getWebView() != null) {
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                }
            } catch (Exception e) {
                Log.e(TAG, "Erro ao ler dados do contato da agenda: " + e.getMessage());
            }
        }
    }

    private void handleIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        String type = intent.getType();

        if (Intent.ACTION_SEND.equals(action) && "text/plain".equals(type)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            if (sharedText != null && !sharedText.trim().isEmpty()) {
                Log.d(TAG, "Recebido compartilhamento de mapas: " + sharedText);
                processSharedMapData(sharedText, null);
            }
        } else if (Intent.ACTION_VIEW.equals(action)) {
            Uri data = intent.getData();
            if (data != null) {
                Log.d(TAG, "Recebido URI de mapas: " + data);
                processSharedMapData(data.toString(), data);
            }
        }
    }

    private void processSharedMapData(String rawText, Uri uri) {
        try {
            JSONObject json = new JSONObject();
            json.put("raw", rawText);

            // Tenta extrair URL de mapas
            String mapUrl = "";
            Matcher urlMatcher = Pattern.compile("https?://\\S+").matcher(rawText);
            if (urlMatcher.find()) {
                mapUrl = urlMatcher.group();
            }
            json.put("url", mapUrl);

            // Tenta extrair coordenadas (ex: @-23.561684,-46.655981 ou q=-23.561684,-46.655981 ou geo:-23.561684,-46.655981)
            Double lat = null;
            Double lng = null;
            Matcher coordMatcher = Pattern.compile("(@|q=|ll=|geo:)(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)").matcher(rawText);
            if (coordMatcher.find()) {
                lat = Double.parseDouble(coordMatcher.group(2));
                lng = Double.parseDouble(coordMatcher.group(3));
            }

            if (lat != null && lng != null) {
                json.put("lat", lat);
                json.put("lng", lng);
            } else {
                json.put("lat", JSONObject.NULL);
                json.put("lng", JSONObject.NULL);
            }

            pendingSharedMapJson = json.toString();
            dispatchSharedMapToWeb(pendingSharedMapJson);
        } catch (Exception e) {
            Log.e(TAG, "Erro ao processar compartilhamento de mapa: " + e.getMessage());
        }
    }

    private void dispatchSharedMapToWeb(String jsonStr) {
        if (jsonStr == null) return;
        if (getBridge() != null && getBridge().getWebView() != null) {
            String js = String.format(
                "(function() { " +
                "  var data = %s; " +
                "  window.__lastSharedMap = data; " +
                "  if (window.onMapShareReceived) { window.onMapShareReceived(data); } " +
                "  window.dispatchEvent(new CustomEvent('mapShareReceived', { detail: data })); " +
                "})();",
                jsonStr
            );
            getBridge().getWebView().evaluateJavascript(js, null);
        }
    }

    private void checkGpsEnabled() {
        try {
            LocationManager locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
            if (locationManager != null) {
                boolean gpsEnabled = locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER);
                boolean networkEnabled = locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
                if (!gpsEnabled && !networkEnabled) {
                    Log.w(TAG, "GPS desativado no aparelho. Abrindo configurações de localização...");
                    Intent intent = new Intent(Settings.ACTION_LOCATION_SOURCE_SETTINGS);
                    intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    startActivity(intent);
                }
            }
        } catch (Exception e) {
            Log.w(TAG, "Erro ao verificar status do GPS: " + e.getMessage());
        }
    }

    private void requestInitialPermissions() {
        List<String> permissions = new ArrayList<>();

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_FINE_LOCATION);
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.POST_NOTIFICATIONS);
            }
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_CONTACTS) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.READ_CONTACTS);
        }

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_MEDIA_IMAGES) != PackageManager.PERMISSION_GRANTED) {
                permissions.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
        } else if (ContextCompat.checkSelfPermission(this, Manifest.permission.READ_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            permissions.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (!permissions.isEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), FOREGROUND_PERMISSION_CODE);
        } else {
            checkBackgroundLocationPermission();
            ensureLocationServiceRunning();
        }
    }

    private void checkBackgroundLocationPermission() {
        // No Android 10+ (API 29+), solicita permissão de localização o tempo todo (segundo plano permanente)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_BACKGROUND_LOCATION) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION},
                    BACKGROUND_LOCATION_CODE
                );
            }
        }
    }

    private void ensureLocationServiceRunning() {
        try {
            if (LocationService.isTrackingEnabled(this)
                && ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                Intent serviceIntent = new Intent(this, LocationService.class);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    ContextCompat.startForegroundService(this, serviceIntent);
                } else {
                    startService(serviceIntent);
                }
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar LocationService: " + e.getMessage());
        }
    }

    public void requestTrackingBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;

        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager == null || powerManager.isIgnoringBatteryOptimizations(getPackageName())) return;

            Intent intent = new Intent(
                Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
                Uri.parse("package:" + getPackageName())
            );
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "Não foi possível solicitar a isenção de bateria para o rastreamento", e);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);

        if (requestCode == FOREGROUND_PERMISSION_CODE) {
            boolean fineLocationGranted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
            if (fineLocationGranted) {
                // Após o usuário conceder a localização comum, solicita a localização permanente de segundo plano
                checkBackgroundLocationPermission();
                ensureLocationServiceRunning();
            }
        } else if (requestCode == BACKGROUND_LOCATION_CODE) {
            ensureLocationServiceRunning();
        }
    }
}
