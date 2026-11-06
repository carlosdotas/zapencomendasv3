package com.zapencomendas.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;
import androidx.core.app.NotificationCompat;

public class WebAppInterface {

    private final MainActivity activity;

    public WebAppInterface(MainActivity activity) {
        this.activity = activity;
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }

    @JavascriptInterface
    public void requireUrgentFullScreenPermission() {
        activity.runOnUiThread(activity::requireUrgentFullScreenPermission);
    }

    @JavascriptInterface
    public boolean prepareUrgentAlerts() {
        boolean ready = activity.driverAlertRequirementsSatisfied();
        activity.runOnUiThread(activity::requireUrgentFullScreenPermission);
        return ready;
    }

    @JavascriptInterface
    public void clearUrgentFullScreenRequirement() {
        activity.runOnUiThread(activity::clearUrgentFullScreenRequirement);
    }

    @JavascriptInterface
    public void showUrgentOffer(String offerId, String name, long expiresAt) {
        activity.runOnUiThread(() -> UrgentNotification.show(activity, offerId, name, expiresAt));
    }

    @JavascriptInterface
    public void cancelUrgentOffer(String offerId) {
        activity.runOnUiThread(() -> {
            UrgentOfferConnection.cancel(offerId);
            UrgentNotification.cancel(activity, offerId);
        });
    }

    @JavascriptInterface
    public String getNativeUrgentOffers() {
        return UrgentOfferConnection.activeOffers();
    }

    @JavascriptInterface
    public String getNativeUrgentCancellations() {
        return UrgentOfferConnection.cancelledOffers();
    }

    @JavascriptInterface
    public double getLatitude() {
        return LocationService.lastLatitude;
    }

    @JavascriptInterface
    public double getLongitude() {
        return LocationService.lastLongitude;
    }

    @JavascriptInterface
    public float getSpeed() {
        return LocationService.lastSpeed;
    }

    @JavascriptInterface
    public boolean isGpsServiceRunning() {
        return LocationService.isRunning;
    }

    @JavascriptInterface
    public boolean configureBackgroundTracking(String endpoint, String driverJson) {
        boolean configured = LocationService.configureTracking(activity, endpoint, driverJson);
        if (configured) {
            activity.runOnUiThread(activity::requestTrackingBatteryOptimizationExemption);
        }
        return configured;
    }

    @JavascriptInterface
    public boolean configureBackgroundTrackingWithAlerts(String endpoint, String driverJson, String socketUrl, String token) {
        boolean configured = LocationService.configureTracking(activity, endpoint, driverJson, socketUrl, token);
        if (configured) activity.runOnUiThread(activity::requestTrackingBatteryOptimizationExemption);
        return configured;
    }

    @JavascriptInterface
    public void stopBackgroundTracking() {
        LocationService.stopTracking(activity);
    }

    @JavascriptInterface
    public void vibrate(long milliseconds) {
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(milliseconds, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(milliseconds);
                }
            }
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void showNotification(String title, String message) {
        try {
            NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager == null) return;

            String channelId = "zap_alerts_channel";
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                NotificationChannel channel = new NotificationChannel(
                    channelId,
                    "Alertas EncomendasZap",
                    NotificationManager.IMPORTANCE_HIGH
                );
                channel.enableVibration(true);
                channel.setShowBadge(true);
                manager.createNotificationChannel(channel);
            }

            Intent intent = new Intent(activity, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent pendingIntent = PendingIntent.getActivity(
                activity,
                (int) System.currentTimeMillis(),
                intent,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT
            );

            NotificationCompat.Builder builder = new NotificationCompat.Builder(activity, channelId)
                .setContentTitle(title)
                .setContentText(message)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pendingIntent);

            manager.notify((int) System.currentTimeMillis(), builder.build());
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void openWhatsApp(String phone, String text) {
        try {
            String cleanPhone = phone.replaceAll("[^0-9]", "");
            String url = "https://api.whatsapp.com/send?phone=" + cleanPhone + "&text=" + Uri.encode(text);
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void pickContact() {
        activity.runOnUiThread(activity::openContactPicker);
    }

    @JavascriptInterface
    public void saveContact(String name, String phone) {
        activity.runOnUiThread(() -> activity.saveContactToAgenda(name, phone));
    }

    @JavascriptInterface
    public boolean hasContactsFeature() {
        return true;
    }

    @JavascriptInterface
    public String getLastSharedMap() {
        return activity.getLastSharedMapJson();
    }

    @JavascriptInterface
    public void clearLastSharedMap() {
        activity.clearLastSharedMapJson();
    }

    @JavascriptInterface
    public void minimizeApp() {
        activity.runOnUiThread(() -> activity.moveTaskToBack(true));
    }
}
