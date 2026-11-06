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
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
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
    private static final String KEY_SOCKET_URL = "urgent_socket_url";
    private static final String KEY_SOCKET_TOKEN = "urgent_socket_token";
    private static final String KEY_LAST_FIX_AT = "last_fix_at";
    private static final String KEY_LAST_SENT_AT = "last_sent_at";
    private static final long MIN_SEND_INTERVAL_MS = 5000L;
    private static final long LOCATION_HEALTH_CHECK_MS = 60_000L;
    private static final long LOCATION_STALE_MS = 120_000L;
    private static final long RECOVERY_DELAY_MS = 15 * 60_000L;
    private static final int RECOVERY_REQUEST_CODE = 2027;

    private LocationManager locationManager;
    private FusedLocationProviderClient fusedLocationClient;
    private PowerManager.WakeLock wakeLock;
    private UrgentOfferConnection urgentConnection;
    private static final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();
    private final Handler healthHandler = new Handler(Looper.getMainLooper());
    private long lastLocationFixAt = 0L;
    private boolean locationUpdatesRegistered = false;
    private final Runnable locationHealthCheck = new Runnable() {
        @Override
        public void run() {
            if (!isTrackingEnabled(LocationService.this)) return;
            long now = System.currentTimeMillis();
            long lastFixAt = getSharedPreferences(PREFS_NAME, MODE_PRIVATE).getLong(KEY_LAST_FIX_AT, 0L);
            if (!locationUpdatesRegistered || lastFixAt == 0L || now - lastFixAt > LOCATION_STALE_MS) {
                Log.w(TAG, "GPS sem atualização recente. Registrando provedores novamente.");
                startFusedLocationUpdates();
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
        return configureTracking(context, endpoint, driverJson, null, null);
    }

    public static boolean configureTracking(Context context, String endpoint, String driverJson, String socketUrl, String token) {
        if (endpoint == null || !endpoint.startsWith("http") || driverJson == null || driverJson.trim().isEmpty()) {
            return false;
        }
        if ((socketUrl != null || token != null) &&
            (!UrgentSocketAddress.isValid(socketUrl) || token == null || token.isEmpty())) {
            Log.e(TAG, "Endereço seguro ou sessão dos alertas inválidos.");
            return false;
        }
        try {
            new JSONObject(driverJson);
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putBoolean(KEY_ENABLED, true)
                .putString(KEY_ENDPOINT, endpoint)
                .putString(KEY_DRIVER, driverJson)
                .putString(KEY_SOCKET_URL, socketUrl)
                .putString(KEY_SOCKET_TOKEN, token)
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
        LocationServices.getFusedLocationProviderClient(context).removeLocationUpdates(nativeLocationPendingIntent(context));
        context.stopService(new Intent(context, LocationService.class));
    }

    private static PendingIntent nativeLocationPendingIntent(Context context) {
        Intent intent = new Intent(context, NativeLocationReceiver.class);
        intent.setPackage(context.getPackageName());
        return PendingIntent.getBroadcast(
            context,
            2028,
            intent,
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
        );
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
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        urgentConnection = new UrgentOfferConnection(this);
        startFusedLocationUpdates();
        startLocationUpdates();
        scheduleRecovery();
        healthHandler.post(locationHealthCheck);
    }

    private void acquireWakeLock() {
        try {
            PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "EncomendasZap:LocationTrackingLock");
                wakeLock.setReferenceCounted(false);
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

    private void startFusedLocationUpdates() {
        if (fusedLocationClient == null) return;
        try {
            LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, 5000L)
                .setMinUpdateIntervalMillis(2000L)
                .setMaxUpdateDelayMillis(5000L)
                .setWaitForAccurateLocation(true)
                .build();
            fusedLocationClient.requestLocationUpdates(request, nativeLocationPendingIntent(this));
            fusedLocationClient.getLastLocation().addOnSuccessListener(location -> {
                if (location == null || System.currentTimeMillis() - location.getTime() > LOCATION_STALE_MS) return;
                recordLocationFix(this, location);
                transmitPersistedLocation(this, location);
            });
        } catch (SecurityException e) {
            Log.e(TAG, "Permissão de localização negada para o rastreamento nativo", e);
        } catch (Exception e) {
            Log.e(TAG, "Falha ao registrar rastreamento nativo", e);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!isTrackingEnabled(this)) {
            stopSelf();
            return START_NOT_STICKY;
        }

        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, MODE_PRIVATE);
        urgentConnection.start(prefs.getString(KEY_SOCKET_URL, null), prefs.getString(KEY_SOCKET_TOKEN, null));
        scheduleRecovery();
        // START_STICKY garante que o Android reinicie o serviço caso seja finalizado pelo sistema.
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location != null) {
            recordLocationFix(this, location);
            Log.d(TAG, "GPS fix: " + lastLatitude + ", " + lastLongitude + " | precisão: " + location.getAccuracy() + "m");
            transmitLocation(location);
        }
    }

    private void transmitLocation(Location location) {
        transmitPersistedLocation(this, location);
    }

    public static void transmitPersistedLocation(Context context, Location location) {
        transmitPersistedLocation(context, location, null);
    }

    public static void recordLocationFix(Context context, Location location) {
        Context appContext = context.getApplicationContext();
        long fixedAt = location.getTime() > 0 ? location.getTime() : System.currentTimeMillis();
        appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putLong(KEY_LAST_FIX_AT, fixedAt)
            .apply();
        lastLatitude = location.getLatitude();
        lastLongitude = location.getLongitude();
        lastSpeed = location.getSpeed();
    }

    public static void transmitPersistedLocation(Context context, Location location, Runnable onComplete) {
        long now = System.currentTimeMillis();
        Context appContext = context.getApplicationContext();
        SharedPreferences prefs = appContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (!prefs.getBoolean(KEY_ENABLED, false)) {
            complete(onComplete);
            return;
        }

        synchronized (LocationService.class) {
            long lastSentAt = prefs.getLong(KEY_LAST_SENT_AT, 0L);
            if (now - lastSentAt < MIN_SEND_INTERVAL_MS) {
                complete(onComplete);
                return;
            }
            prefs.edit().putLong(KEY_LAST_SENT_AT, now).apply();
        }

        String endpoint = prefs.getString(KEY_ENDPOINT, null);
        String savedDriver = prefs.getString(KEY_DRIVER, null);
        if (endpoint == null || savedDriver == null) {
            complete(onComplete);
            return;
        }

        lastLatitude = location.getLatitude();
        lastLongitude = location.getLongitude();
        lastSpeed = location.getSpeed();
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
                connection.setConnectTimeout(4000);
                connection.setReadTimeout(4000);
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
                complete(onComplete);
            }
        });
    }

    private static void complete(Runnable onComplete) {
        if (onComplete != null) onComplete.run();
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
        if (urgentConnection != null) urgentConnection.stop();
        healthHandler.removeCallbacks(locationHealthCheck);
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        locationUpdatesRegistered = false;
        if (!isTrackingEnabled(this) && fusedLocationClient != null) {
            fusedLocationClient.removeLocationUpdates(nativeLocationPendingIntent(this));
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        scheduleRecovery();
        super.onDestroy();
        Log.d(TAG, "LocationService destruído.");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
