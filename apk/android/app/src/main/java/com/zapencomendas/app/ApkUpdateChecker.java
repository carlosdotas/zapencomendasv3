package com.zapencomendas.app;

import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

final class ApkUpdateChecker {
    private static final String TAG = "ApkUpdateChecker";
    private static final String VERSION_URL = "https://zapencomendas.ai.studio/download/apk-version.json";
    private static final String DOWNLOAD_URL = "https://zapencomendas.ai.studio/download/zap-encomendas.apk";
    private static final long CHECK_INTERVAL_MS = 5 * 60 * 1000L;
    private static final int MAX_RESPONSE_BYTES = 16384;

    private final MainActivity activity;
    private final SharedPreferences preferences;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Runnable periodicCheck = new Runnable() {
        @Override public void run() {
            check();
            handler.postDelayed(this, CHECK_INTERVAL_MS);
        }
    };
    private AlertDialog dialog;
    private boolean active;
    private boolean checking;

    ApkUpdateChecker(MainActivity activity) {
        this.activity = activity;
        this.preferences = activity.getSharedPreferences("apk_updates", Context.MODE_PRIVATE);
    }

    void start() {
        if (active) return;
        active = true;
        showRequiredUpdate();
        periodicCheck.run();
    }

    void stop() {
        active = false;
        handler.removeCallbacks(periodicCheck);
    }

    void destroy() {
        stop();
        executor.shutdownNow();
        if (dialog != null) dialog.dismiss();
    }

    private void check() {
        if (checking) return;
        checking = true;
        executor.execute(() -> {
            try {
                JSONObject manifest = readManifest();
                long versionCode = manifest.getLong("versionCode");
                String versionName = manifest.getString("versionName").trim();
                if (versionCode <= 0 || versionName.isEmpty() || versionName.length() > 80) {
                    throw new IllegalArgumentException("Manifesto de APK inválido");
                }
                handler.post(() -> {
                    if (versionCode > preferences.getLong("versionCode", 0)) {
                        preferences.edit().putLong("versionCode", versionCode)
                            .putString("versionName", versionName).apply();
                    }
                    if (active) showRequiredUpdate();
                });
            } catch (Exception error) {
                Log.w(TAG, "Não foi possível verificar a atualização do APK", error);
            } finally {
                handler.post(() -> checking = false);
            }
        });
    }

    private JSONObject readManifest() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(VERSION_URL).openConnection();
        connection.setConnectTimeout(10000);
        connection.setReadTimeout(10000);
        connection.setUseCaches(false);
        connection.setRequestProperty("Cache-Control", "no-cache, no-store");
        connection.setInstanceFollowRedirects(false);
        try {
            int status = connection.getResponseCode();
            if (status != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Manifesto de APK retornou HTTP " + status);
            }
            try (InputStream input = connection.getInputStream();
                 ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[2048];
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > MAX_RESPONSE_BYTES) {
                        throw new IllegalStateException("Manifesto de APK excede o tamanho permitido");
                    }
                    output.write(buffer, 0, count);
                }
                return new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8));
            }
        } finally {
            connection.disconnect();
        }
    }

    private void showRequiredUpdate() {
        long available = preferences.getLong("versionCode", 0);
        if (!ApkUpdateVersion.isUpdateRequired(BuildConfig.VERSION_CODE, available)) {
            if (dialog != null) {
                dialog.dismiss();
                dialog = null;
            }
            return;
        }
        if (dialog != null && dialog.isShowing()) return;

        String version = preferences.getString("versionName", "");
        dialog = new AlertDialog.Builder(activity)
            .setTitle("Atualização obrigatória")
            .setMessage("Uma nova versão do aplicativo (" + version + ") está disponível. "
                + "Baixe e instale a atualização para continuar. O Android pode solicitar permissão para instalar aplicativos.")
            .setPositiveButton("Baixar atualização", null)
            .setCancelable(false)
            .create();
        dialog.setCanceledOnTouchOutside(false);
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(DOWNLOAD_URL + "?version=" + available)));
            } catch (ActivityNotFoundException error) {
                Log.e(TAG, "Não foi possível abrir o download do APK", error);
                Toast.makeText(activity, "Não foi possível abrir o navegador para baixar a atualização.", Toast.LENGTH_LONG).show();
            }
        }));
        dialog.show();
    }
}
