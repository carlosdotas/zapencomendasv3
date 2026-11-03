package com.zapencomendas.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.location.Location;
import android.util.Log;
import com.google.android.gms.location.LocationResult;

public class NativeLocationReceiver extends BroadcastReceiver {
    private static final String TAG = "EncomendasZapGPS";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (!LocationService.isTrackingEnabled(context) || !LocationResult.hasResult(intent)) {
            return;
        }

        LocationResult result = LocationResult.extractResult(intent);
        Location location = result == null ? null : result.getLastLocation();
        if (location == null) {
            Log.w(TAG, "Atualização nativa recebida sem coordenadas.");
            return;
        }

        PendingResult pendingResult = goAsync();
    LocationService.recordLocationFix(context, location);
        LocationService.transmitPersistedLocation(context, location, pendingResult::finish);
    }
}
