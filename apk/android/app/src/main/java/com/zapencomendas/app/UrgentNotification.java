package com.zapencomendas.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Notification;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import java.util.HashMap;
import java.util.Map;

final class UrgentNotification {
    static final String ACTION_OPEN = "com.zapencomendas.app.OPEN_URGENT_OFFER";
    static final String EXTRA_OFFER_ID = "urgent_offer_id";
    static final String EXTRA_EXPIRES_AT = "urgent_expires_at";
    static final String CHANNEL_ID = "urgent_orders";
    private static final int NOTIFICATION_ID = 4211;
    private static final String TAG = "UrgentNotification";
    private static final Map<String, Long> shownOffers = new HashMap<>();

    static synchronized void show(Context activity, String offerId, String name, long expiresAt) {
        long now = System.currentTimeMillis();
        long remaining = expiresAt - now;
        if (!UrgentOfferWindow.isActive(offerId, expiresAt, now)) {
            Log.w(TAG, "Convite inválido ou expirado; notificação não exibida.");
            return;
        }
        shownOffers.entrySet().removeIf(entry -> entry.getValue() <= now);
        if (Long.valueOf(expiresAt).equals(shownOffers.get(offerId))) return;
        NotificationManager manager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            Log.e(TAG, "Serviço de notificações indisponível.");
            return;
        }
        ensureChannel(manager);
        Intent intent = new Intent(activity, MainActivity.class)
            .setAction(ACTION_OPEN)
            .setData(Uri.parse("zapencomendas://urgent/" + Uri.encode(offerId)))
            .putExtra(EXTRA_OFFER_ID, offerId)
            .putExtra(EXTRA_EXPIRES_AT, expiresAt)
            .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(activity, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(activity, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Coleta urgente disponível")
            .setContentText(name + " - toque para abrir o convite")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_EVENT)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setTimeoutAfter(remaining)
            .setContentIntent(pending)
            .setFullScreenIntent(pending, true);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            notification.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE);
        }
        try {
            NotificationManagerCompat.from(activity).notify(offerId, NOTIFICATION_ID, notification.build());
            shownOffers.put(offerId, expiresAt);
        } catch (SecurityException error) {
            Log.e(TAG, "Permissão de notificação negada para coleta urgente.", error);
        }
    }

    static void ensureChannel(NotificationManager manager) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "Coletas urgentes", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("Convites urgentes para motoristas");
            channel.enableVibration(true);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
            manager.createNotificationChannel(channel);
        }
    }

    static synchronized void cancel(Context activity, String offerId) {
        if (offerId == null || offerId.isEmpty()) return;
        shownOffers.remove(offerId);
        NotificationManagerCompat.from(activity).cancel(offerId, NOTIFICATION_ID);
        if (activity instanceof MainActivity) ((MainActivity) activity).cancelUrgentLockScreen(offerId);
    }
}
