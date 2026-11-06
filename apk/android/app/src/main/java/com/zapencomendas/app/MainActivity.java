package com.zapencomendas.app;

import android.Manifest;
import android.app.AlertDialog;
import android.app.KeyguardManager;
import android.app.NotificationManager;
import android.app.NotificationChannel;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.location.LocationManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.ContactsContract;
import android.provider.Settings;
import android.util.Log;
import org.json.JSONObject;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.app.NotificationManagerCompat;
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
    private static final int ALERT_NOTIFICATION_PERMISSION_CODE = 1004;
    private static final int PICK_CONTACT_REQUEST = 2001;

    private String pendingSharedMapJson = null;
    private ApkUpdateChecker apkUpdateChecker;
    private PermissionRequest pendingMediaRequest;
    private boolean startupPermissionRequestPending;
    private boolean returningFromBackgroundSettings;
    private boolean startupPermissionsFinished;
    private boolean fullScreenPermissionRequired;
    private boolean fullScreenSettingsOpen;
    private boolean alertNotificationPermissionRequested;
    private AlertDialog fullScreenPermissionDialog;
    private String lockScreenOfferId;
    private long lockScreenOfferExpiresAt;
    private final Handler lockScreenHandler = new Handler(Looper.getMainLooper());
    private final Runnable lockScreenExpiry = this::clearUrgentLockScreen;
    private final BroadcastReceiver urgentSyncReceiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            String cancelledId = intent.getStringExtra(UrgentNotification.EXTRA_OFFER_ID);
            long expiresAt = intent.getLongExtra(UrgentNotification.EXTRA_EXPIRES_AT, 0);
            if (cancelledId != null && expiresAt >= lockScreenOfferExpiresAt) cancelUrgentLockScreen(cancelledId);
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('zap:native-urgent-sync'))", null);
            }
        }
    };

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
        handleUrgentIntent(intent);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        apkUpdateChecker = new ApkUpdateChecker(this);
        showSystemBars();
        setupBackButtonHandler();
        setupWebView();
        ContextCompat.registerReceiver(this, urgentSyncReceiver, new IntentFilter(UrgentOfferConnection.ACTION_SYNC), ContextCompat.RECEIVER_NOT_EXPORTED);
        requestInitialPermissions();
        ensureLocationServiceRunning();
        handleIncomingIntent(getIntent());
        handleUrgentIntent(getIntent());
    }

    @Override
    public void onResume() {
        super.onResume();
        if (apkUpdateChecker != null) apkUpdateChecker.start();
        showSystemBars();
        if (returningFromBackgroundSettings) {
            returningFromBackgroundSettings = false;
            finishStartupPermissions();
        }
        if (fullScreenSettingsOpen) {
            fullScreenSettingsOpen = false;
        }
        showFullScreenPermissionIfNeeded();
        ensureLocationServiceRunning();
        // Garantir que os temporizadores JS continuem ativos
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().resumeTimers();
            getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('zap:native-urgent-sync'))", null);
        }
    }

    @Override
    public void onPause() {
        super.onPause();
        if (apkUpdateChecker != null) apkUpdateChecker.stop();
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
    public void onDestroy() {
        unregisterReceiver(urgentSyncReceiver);
        lockScreenHandler.removeCallbacks(lockScreenExpiry);
        if (fullScreenPermissionDialog != null) fullScreenPermissionDialog.dismiss();
        if (apkUpdateChecker != null) apkUpdateChecker.destroy();
        super.onDestroy();
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
                    runOnUiThread(() -> handleMediaPermissionRequest(request));
                }

                @Override
                public void onPermissionRequestCanceled(PermissionRequest request) {
                    runOnUiThread(() -> {
                        if (pendingMediaRequest == request) pendingMediaRequest = null;
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

            // Tenta extrair URL de mapas (prefere o link de mapas quando a mensagem tem vários links)
            String mapUrl = "";
            Matcher urlMatcher = Pattern.compile("https?://[^\\s\"'<>]+").matcher(rawText);
            while (urlMatcher.find()) {
                String candidate = urlMatcher.group().replaceAll("[)\\]'\",;.!?]+$", "");
                if (mapUrl.isEmpty()) mapUrl = candidate;
                if (candidate.matches("(?i).*(maps\\.app\\.goo\\.gl|goo\\.gl/maps|google\\.[a-z.]+/maps|maps\\.google\\.).*")) {
                    mapUrl = candidate;
                    break;
                }
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

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED;
    }

    private void requestInitialPermissions() {
        List<String> permissions = StartupPermissions.missing(Build.VERSION.SDK_INT, this::hasPermission);
        if (!permissions.isEmpty()) {
            startupPermissionRequestPending = true;
            ActivityCompat.requestPermissions(this, permissions.toArray(new String[0]), FOREGROUND_PERMISSION_CODE);
        } else {
            checkBackgroundLocationPermission();
        }
    }

    private void checkBackgroundLocationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            || hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
            || (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION))) {
            finishStartupPermissions();
            return;
        }
        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            startupPermissionRequestPending = true;
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.ACCESS_BACKGROUND_LOCATION}, BACKGROUND_LOCATION_CODE);
            return;
        }
        new AlertDialog.Builder(this)
            .setTitle("Localização em segundo plano")
            .setMessage("Para manter o rastreamento quando o aplicativo estiver fechado, permita a localização o tempo todo nas configurações do Android.")
            .setPositiveButton("Abrir configurações", (dialog, which) -> {
                returningFromBackgroundSettings = true;
                if (!openAppSettings()) {
                    returningFromBackgroundSettings = false;
                    finishStartupPermissions();
                }
            })
            .setNegativeButton("Agora não", (dialog, which) -> finishStartupPermissions())
            .setOnCancelListener(dialog -> finishStartupPermissions())
            .show();
    }

    private boolean openAppSettings() {
        try {
            startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
            return true;
        } catch (Exception error) {
            Log.e(TAG, "Não foi possível abrir as configurações de permissões.", error);
            Toast.makeText(this, "Abra as configurações do aplicativo para alterar as permissões.", Toast.LENGTH_LONG).show();
            return false;
        }
    }

    private void finishStartupPermissions() {
        ensureLocationServiceRunning();
        List<String> missing = StartupPermissions.missing(Build.VERSION.SDK_INT, this::hasPermission);
        if (!missing.isEmpty()) {
            new AlertDialog.Builder(this)
                .setTitle("Localização não concedida")
                .setMessage("A localização precisa é necessária para o mapa e o rastreamento. Você pode permiti-la nas configurações do Android.")
                .setPositiveButton("Configurações", (dialog, which) -> {
                    startupPermissionsFinished = true;
                    openAppSettings();
                })
                .setNegativeButton("Continuar", (dialog, which) -> finishStartupDialogs())
                .setOnCancelListener(dialog -> finishStartupDialogs())
                .show();
        } else {
            finishStartupDialogs();
        }
    }

    private void finishStartupDialogs() {
        startupPermissionsFinished = true;
        checkGpsEnabled();
        showFullScreenPermissionIfNeeded();
    }

    public void requireUrgentFullScreenPermission() {
        fullScreenPermissionRequired = true;
        showFullScreenPermissionIfNeeded();
    }

    public void clearUrgentFullScreenRequirement() {
        fullScreenPermissionRequired = false;
        if (fullScreenPermissionDialog != null) {
            fullScreenPermissionDialog.dismiss();
            fullScreenPermissionDialog = null;
        }
    }

    private void showFullScreenPermissionIfNeeded() {
        if (!fullScreenPermissionRequired || !startupPermissionsFinished || fullScreenSettingsOpen
            || isFinishing() || isDestroyed()) return;
        DriverAlertRequirements.Missing missing = missingDriverAlertRequirement();
        if (missing == DriverAlertRequirements.Missing.NONE) {
            if (fullScreenPermissionDialog != null) {
                fullScreenPermissionDialog.dismiss();
                fullScreenPermissionDialog = null;
            }
            return;
        }
        if (fullScreenPermissionDialog != null && fullScreenPermissionDialog.isShowing()) return;
        showMissingDriverAlertRequirement(missing);
    }

    public boolean driverAlertRequirementsSatisfied() {
        return missingDriverAlertRequirement() == DriverAlertRequirements.Missing.NONE;
    }

    private DriverAlertRequirements.Missing missingDriverAlertRequirement() {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            Log.e(TAG, "Serviço de notificações indisponível para verificar permissões.");
        } else {
            UrgentNotification.ensureChannel(manager);
        }
        boolean channelReady = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = manager == null ? null : manager.getNotificationChannel(UrgentNotification.CHANNEL_ID);
            channelReady = channel != null && channel.getImportance() >= NotificationManager.IMPORTANCE_HIGH
                && channel.getSound() != null;
            if (channelReady && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && channel.getGroup() != null) {
                android.app.NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
                channelReady = group == null || !group.isBlocked();
            }
        }
        return DriverAlertRequirements.firstMissing(
            Build.VERSION.SDK_INT,
            hasPermission(Manifest.permission.ACCESS_FINE_LOCATION),
            Build.VERSION.SDK_INT < Build.VERSION_CODES.Q || hasPermission(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
            manager != null && NotificationManagerCompat.from(this).areNotificationsEnabled()
                && (Build.VERSION.SDK_INT < 33 || hasPermission(Manifest.permission.POST_NOTIFICATIONS)),
            channelReady,
            Build.VERSION.SDK_INT < 34 || (manager != null && manager.canUseFullScreenIntent())
        );
    }

    private void showMissingDriverAlertRequirement(DriverAlertRequirements.Missing missing) {
        String message;
        Intent settings;
        switch (missing) {
            case LOCATION:
                message = "Permita a localização precisa para identificar as coletas próximas.";
                settings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                break;
            case BACKGROUND_LOCATION:
                message = "Permita a localização o tempo todo para receber coletas com o aplicativo em segundo plano.";
                settings = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                break;
            case NOTIFICATIONS:
                message = "Ative as notificações do aplicativo para receber coletas urgentes.";
                settings = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                break;
            case CHANNEL:
                message = "Ative o canal Coletas urgentes com som e alta prioridade para receber os chamados.";
                settings = new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                    .putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                    .putExtra(Settings.EXTRA_CHANNEL_ID, UrgentNotification.CHANNEL_ID);
                break;
            case FULL_SCREEN:
                message = "Permita notificações em tela cheia para receber os convites urgentes sobre a tela bloqueada.";
                settings = new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                    Uri.parse("package:" + getPackageName()));
                break;
            default:
                return;
        }
        fullScreenPermissionDialog = new AlertDialog.Builder(this)
            .setTitle("Permissão obrigatória para alertas urgentes")
            .setMessage(message)
            .setPositiveButton("Abrir configurações", null)
            .setCancelable(false)
            .create();
        fullScreenPermissionDialog.setCanceledOnTouchOutside(false);
        fullScreenPermissionDialog.setOnShowListener(ignored ->
            fullScreenPermissionDialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
                try {
                    fullScreenSettingsOpen = true;
                    if (missing == DriverAlertRequirements.Missing.NOTIFICATIONS
                        && Build.VERSION.SDK_INT >= 33
                        && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)
                        && !alertNotificationPermissionRequested) {
                        alertNotificationPermissionRequested = true;
                        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, ALERT_NOTIFICATION_PERMISSION_CODE);
                    } else {
                        startActivity(settings);
                    }
                    fullScreenPermissionDialog.dismiss();
                    fullScreenPermissionDialog = null;
                } catch (Exception error) {
                    fullScreenSettingsOpen = false;
                    Log.e(TAG, "Não foi possível abrir as configurações de alertas.", error);
                    Toast.makeText(this, "Não foi possível abrir as configurações. Ajuste as permissões do aplicativo no Android.", Toast.LENGTH_LONG).show();
                }
            }));
        fullScreenPermissionDialog.show();
    }

    private void handleUrgentIntent(Intent intent) {
        if (intent == null || !UrgentNotification.ACTION_OPEN.equals(intent.getAction())) return;
        long expiresAt = intent.getLongExtra(UrgentNotification.EXTRA_EXPIRES_AT, 0);
        String offerId = intent.getStringExtra(UrgentNotification.EXTRA_OFFER_ID);
        long remaining = expiresAt - System.currentTimeMillis();
        if (!UrgentOfferWindow.isActive(offerId, expiresAt, System.currentTimeMillis())) return;
        lockScreenOfferId = offerId;
        lockScreenOfferExpiresAt = expiresAt;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        lockScreenHandler.removeCallbacks(lockScreenExpiry);
        lockScreenHandler.postDelayed(lockScreenExpiry, remaining);
    }

    public void cancelUrgentLockScreen(String offerId) {
        if (offerId.equals(lockScreenOfferId)) clearUrgentLockScreen();
    }

    private void clearUrgentLockScreen() {
        if (lockScreenOfferId == null) return;
        lockScreenOfferId = null;
        lockScreenOfferExpiresAt = 0;
        lockScreenHandler.removeCallbacks(lockScreenExpiry);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(false);
            setTurnScreenOn(false);
        } else {
            getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        KeyguardManager keyguard = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard != null && keyguard.isKeyguardLocked()) moveTaskToBack(true);
    }

    private void handleMediaPermissionRequest(PermissionRequest request) {
        List<String> needed = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission;
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) permission = Manifest.permission.CAMERA;
            else if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) permission = Manifest.permission.RECORD_AUDIO;
            else {
                request.deny();
                return;
            }
            if (!hasPermission(permission) && !needed.contains(permission)) needed.add(permission);
        }
        if (needed.isEmpty()) {
            request.grant(request.getResources());
        } else if (startupPermissionRequestPending || pendingMediaRequest != null) {
            request.deny();
            Toast.makeText(this, "Conclua a solicitação de permissões e tente novamente.", Toast.LENGTH_LONG).show();
        } else {
            pendingMediaRequest = request;
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), MEDIA_PERMISSION_CODE);
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
            startupPermissionRequestPending = false;
            checkBackgroundLocationPermission();
        } else if (requestCode == BACKGROUND_LOCATION_CODE) {
            startupPermissionRequestPending = false;
            finishStartupPermissions();
        } else if (requestCode == ALERT_NOTIFICATION_PERMISSION_CODE) {
            fullScreenSettingsOpen = false;
            showFullScreenPermissionIfNeeded();
        } else if (requestCode == MEDIA_PERMISSION_CODE && pendingMediaRequest != null) {
            PermissionRequest request = pendingMediaRequest;
            pendingMediaRequest = null;
            boolean granted = grantResults.length > 0;
            for (int result : grantResults) granted = granted && result == PackageManager.PERMISSION_GRANTED;
            if (granted) request.grant(request.getResources());
            else {
                request.deny();
                Toast.makeText(this, "Permita a câmera e o microfone para usar este recurso.", Toast.LENGTH_LONG).show();
            }
        }
    }
}
