package com.zapencomendas.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;
import androidx.core.content.ContextCompat;

public class LocationRecoveryReceiver extends BroadcastReceiver {
    private static final String TAG = "EncomendasZapGPS";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!LocationService.isTrackingEnabled(context)) {
            return;
        }

        try {
            Intent serviceIntent = new Intent(context, LocationService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(context, serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
        } catch (Exception e) {
            Log.e(TAG, "Não foi possível recuperar o serviço de GPS", e);
        }
    }
}
