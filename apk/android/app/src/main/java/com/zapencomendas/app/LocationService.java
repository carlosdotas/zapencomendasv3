package com.zapencomendas.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

public class LocationService extends Service implements LocationListener {

    private static final String TAG = "EncomendasZapGPS";
    public static final String CHANNEL_ID = "zap_location_channel";
    public static final int NOTIFICATION_ID = 2026;

    private LocationManager locationManager;
    private PowerManager.WakeLock wakeLock;

    public static double lastLatitude = 0.0;
    public static double lastLongitude = 0.0;
    public static float lastSpeed = 0.0f;
    public static boolean isRunning = false;

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        Log.d(TAG, "LocationService criado. Iniciando rastreamento contínuo em segundo plano.");

        acquireWakeLock();
        createNotificationChannel();
        startForegroundWithNotification();
        startLocationUpdates();
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
            // Registra GPS Provider (alta precisão)
            if (locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.GPS_PROVIDER,
                    2000L, // 2 segundos
                    0.0f,  // 0 metros
                    this
                );
            }

            // Registra Network Provider como fallback
            if (locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER)) {
                locationManager.requestLocationUpdates(
                    LocationManager.NETWORK_PROVIDER,
                    3000L,
                    0.0f,
                    this
                );
            }
        } catch (SecurityException se) {
            Log.e(TAG, "Permissão de localização negada ao iniciar atualizações: " + se.getMessage());
        } catch (Exception e) {
            Log.e(TAG, "Erro ao iniciar atualizações de GPS: " + e.getMessage());
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // START_STICKY garante que o Android reinicie o serviço caso seja finalizado pelo sistema
        return START_STICKY;
    }

    @Override
    public void onLocationChanged(Location location) {
        if (location != null) {
            lastLatitude = location.getLatitude();
            lastLongitude = location.getLongitude();
            lastSpeed = location.getSpeed();
            Log.d(TAG, "GPS fix: " + lastLatitude + ", " + lastLongitude + " | precisão: " + location.getAccuracy() + "m");
        }
    }

    @Override
    public void onStatusChanged(String provider, int status, Bundle extras) {}

    @Override
    public void onProviderEnabled(String provider) {
        Log.d(TAG, "Provedor GPS ativado: " + provider);
    }

    @Override
    public void onProviderDisabled(String provider) {
        Log.w(TAG, "Provedor GPS desativado: " + provider);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        super.onTaskRemoved(rootIntent);
        Log.d(TAG, "App removido dos recentes. Reiniciando serviço para manter monitoramento...");
        Intent restartServiceIntent = new Intent(getApplicationContext(), this.getClass());
        restartServiceIntent.setPackage(getPackageName());
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(restartServiceIntent);
        } else {
            startService(restartServiceIntent);
        }
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        if (locationManager != null) {
            try {
                locationManager.removeUpdates(this);
            } catch (Exception ignored) {}
        }
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        super.onDestroy();
        Log.d(TAG, "LocationService destruído.");
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
