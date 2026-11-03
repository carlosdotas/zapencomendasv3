package com.zapencomendas.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.app.AlarmManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class LocationService extends Service implements LocationListener {

    private static final String TAG = "EncomendasZapGPS";
    public static final String CHANNEL_ID = "zap_location_channel";
    public static final int NOTIFICATION_ID = 2026;
    private static final String PREFS_NAME = "background_tracking";
    private static final String KEY_ENABLED = "enabled";
    private static final String KEY_ENDPOINT = "endpoint";
    private static final String KEY_DRIVER = "driver";
    private static final long MIN_SEND_INTERVAL_MS = 5000L;
    private static final long LOCATION_HEALTH_CHECK_MS = 60_000L;
    private static final long LOCATION_STALE_MS = 120_000L;
    private static final long RECOVERY_DELAY_MS = 15 * 60_000L;
    private static final int RECOVERY_REQUEST_CODE = 2027;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final Handler healthHandler = new Handler(Looper.getMainLooper());
    private long lastSentAt = 0L;
    private long lastLocationFixAt = 0L;
    private boolean locationUpdatesRegistered = false;
    private final Runnable locationHealthCheck = new Runnable() {
        @Override
        public void run() {
            if (!isTrackingEnabled(LocationService.this)) return;
            long now = System.currentTimeMillis();
            if (!locationUpdatesRegistered || (lastLocationFixAt > 0 && now - lastLocationFixAt > LOCATION_STALE_MS)) {
                Log.w(TAG, "GPS sem atualização recente. Registrando provedores novamente.");
                startLocationUpdates();
            }
            healthHandler.postDelayed(this, LOCATION_HEALTH_CHECK_MS);
        }
    };

    public static double lastLatitude = 0.0;
    public static double lastLongitude = 0.0;
    public static float lastSpeed = 0.0f;
    public static boolean isRunning = false;

    public static boolean isTrackingEnabled(Context context) {
        return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    public static boolean configureTracking(Context context, String endpoint, String driverJson) {
        if (endpoint == null || !endpoint.startsWith("http") || driverJson == null || driverJson.trim().isEmpty()) {
            return false;
        }
        try {
            new JSONObject(driverJson);
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, true)
                .putString(KEY_ENDPOINT, endpoint)
                .putString(KEY_DRIVER, driverJson)
                .apply();

            Intent serviceIntent = new Intent(context, LocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            return true;
        } catch (Exception e) {
            Log.e(TAG, "Configuração de rastreamento inválida", e);
            return false;
        }
    }

    public static void stopTracking(Context context) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply();
        cancelRecovery(context);
        context.stopService(new Intent(context, LocationService.class));
    }

    private static PendingIntent recoveryPendingIntent(Context context) {
        Intent intent = new Intent(context, LocationRecoveryReceiver.class);
        intent.setPackage(context.getPackageName());
        return PendingIntent.getBroadcast(
            context,
            RECOVERY_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
    }

    private static void cancelRecovery(Context context) {
        AlarmManager alarmManager = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.cancel(recoveryPendingIntent(context));
        }
    }

    private void scheduleRecovery() {
        if (!isTrackingEnabled(this)) return;
        AlarmManager alarmManager = (AlarmManager) getSystemService(Context.ALARM_SERVICE);
        if (alarmManager != null) {
            alarmManager.setAndAllowWhileIdle(
                AlarmManager.ELAPSED_REALTIME_WAKEUP,
                SystemClock.elapsedRealtime() + RECOVERY_DELAY_MS,
                recoveryPendingIntent(this)
            );
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        Log.d(TAG, "LocationService criado. Iniciando rastreamento contínuo em segundo plano.");

        acquireWakeLock();
        createNotificationChannel();
        startForegroundWithNotification();
        startLocationUpdates();
        scheduleRecovery();
        healthHandler.post(locationHealthCheck);
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EncomendasZap:LocationTrackingLock");
                wakeLock.acquire();
            }
        } catch (Exception e) {
            Log.e(TAG, "Erro ao adquirir WakeLock: " + e.getMessage());
        }
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Monitoramento de GPS (EncomendasZap)",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Mantém o GPS ativo permanentemente para entregas e monitoramento em tempo real.");
            channel.enableVibration(false);
            channel.setShowBadge(false);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void startForegroundWithNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            0,
            notificationIntent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );

        Notification notification = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("EncomendasZap - GPS Ativo")
            .setContentText("Monitoramento de localização permanente em tempo real ativo.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(pendingIntent)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
    }

    private void startLocationUpdates() {
        locationManager = (LocationManager) getSystemService(Context.LOCATION_SERVICE);
        if (locationManager == null) return;

        try {
            if (locationUpdatesRegistered) {
                locationManager.removeUpdates(this);
                locationUpdatesRegistered = false;
            }

            // Registra GPS Provider (alta precisão)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    2000L, // 2 segundos
                    0.0f,  // 0 metros
                    this
                );
                locationUpdatesRegistered = true;
            }

            // Registra Network Provider como fallback
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    3000L,
                    0.0f,
                    this
                );
                locationUpdatesRegistered = true;
            }
        } catch (SecurityException se) {
            Log.e(TAG, "Permissão de localização negada ao iniciar atualizações: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar atualizações de GPS: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!isTrackingEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        scheduleRecovery();
        // START_STICKY garante que o Android reinicie o serviço caso seja finalizado pelo sistema.
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location != null) {
            lastLocationFixAt = System.currentTimeMillis();
            lastLatitude = location.getLatitude();
            lastLongitude = location.getLongitude();
            lastSpeed = location.getSpeed();
            Log.d(TAG, "GPS fix: " + lastLatitude + ", " + lastLongitude + " | precisão: " + location.getAccuracy() + "m");
            transmitLocation(location);
        }
    }

    private void transmitLocation(Location location) {
        long now = System.currentTimeMillis();
        if (now - lastSentAt < MIN_SEND_INTERVAL_MS) return;

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) return;

        String endpoint = prefs.getString(KEY_ENDPOINT, null);
        String savedDriver = prefs.getString(KEY_DRIVER, null);
        if (endpoint == null || savedDriver == null) return;

        lastSentAt = now;
        networkExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                JSONObject driver = new JSONObject(savedDriver);
                JSONObject coordinates = new JSONObject();
                coordinates.put("lat", location.getLatitude());
                coordinates.put("lng", location.getLongitude());
                coordinates.put("heading", location.hasBearing() ? location.getBearing() : JSONObject.NULL);
                coordinates.put("speed", location.hasSpeed() ? location.getSpeed() : JSONObject.NULL);
                coordinates.put("timestamp", location.getTime() > 0 ? location.getTime() : System.currentTimeMillis());
                driver.put("coordinates", coordinates);
                driver.put("heading", location.hasBearing() ? location.getBearing() : 0);
                driver.put("speedKmH", location.hasSpeed() ? Math.round(location.getSpeed() * 3.6f) : 0);
                driver.put("status", "em_rota");
                driver.put("isOnline", true);
                driver.put("lastSeenTimestamp", System.currentTimeMillis());

                connection = (HttpURLConnection) new URL(endpoint).openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(10000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                connection.setRequestProperty("Accept", "application/json");
                byte[] body = driver.toString().getBytes(StandardCharsets.UTF_8);
                connection.setFixedLengthStreamingMode(body.length);
                try (OutputStream output = connection.getOutputStream()) {
                    output.write(body);
                }
                int status = connection.getResponseCode();
                if (status < 200 || status >= 300) {
                    Log.w(TAG, "Servidor de rastreamento respondeu HTTP " + status);
                }
            } catch (Exception e) {
                Log.w(TAG, "Falha ao enviar localização ao servidor: " + e.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {
        Log.d(TAG, "Provedor GPS ativado: " + provider);
        startLocationUpdates();
    }

    @Override
    public void onProviderDisabled(String provider) {
        Log.w(TAG, "Provedor GPS desativado: " + provider);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        if (!isTrackingEnabled(this)) {
            stopSelf();
            return;
        }
        Log.d(TAG, "App removido dos recentes. Serviço de GPS permanece ativo em primeiro plano.");
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        healthHandler.removeCallbacks(locationHealthCheck);
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        locationUpdatesRegistered = false;
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        scheduleRecovery();
        networkExecutor.shutdownNow();
        super.onDestroy();
        Log.d(TAG, "LocationService destruído.");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
