package com.zapencomendas.app;

import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import androidx.annotation.NonNull;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class UrgentOfferConnection {
    private static final String TAG = "UrgentOfferConnection";
    static final String ACTION_SYNC = "com.zapencomendas.app.SYNC_URGENT_OFFERS";
    private static final Map<String, JSONObject> offers = new LinkedHashMap<>();
    private static final Map<String, Long> cancellations = new LinkedHashMap<>();
    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final OkHttpClient client = new OkHttpClient.Builder().pingInterval(20, TimeUnit.SECONDS).build();
    private volatile WebSocket socket;
    private String url;
    private String token;
    private volatile boolean stopped = true;
    private final Runnable reconnect = this::connect;

    UrgentOfferConnection(Context context) {
        this.context = context.getApplicationContext();
    }

    void start(String url, String token) {
        if (!UrgentSocketAddress.isValid(url) || token == null || token.isEmpty()) {
            Log.w(TAG, "Sessão ou endereço seguro ausente; alertas nativos indisponíveis.");
            stop();
            return;
        }
        if (!stopped && url.equals(this.url) && token.equals(this.token)) return;
        stop();
        this.url = url;
        this.token = token;
        stopped = false;
        connect();
    }

    private void connect() {
        if (stopped || socket != null) return;
        try {
            Request request = new Request.Builder().url(url).build();
            socket = client.newWebSocket(request, new WebSocketListener() {
                @Override
                public void onOpen(@NonNull WebSocket webSocket, @NonNull Response response) {
                    handler.post(() -> {
                        if (stopped || socket != webSocket) return;
                        try {
                            if (!webSocket.send(new JSONObject().put("type", "auth").put("token", token).toString())) {
                                Log.w(TAG, "Não foi possível enviar autenticação de alertas.");
                                webSocket.cancel();
                            }
                        } catch (JSONException error) {
                            Log.e(TAG, "Não foi possível autenticar alertas nativos.", error);
                            webSocket.cancel();
                        }
                    });
                }

                @Override
                public void onMessage(@NonNull WebSocket webSocket, @NonNull String text) {
                    handler.post(() -> handleMessage(webSocket, text));
                }

                @Override
                public void onClosing(@NonNull WebSocket webSocket, int code, @NonNull String reason) {
                    webSocket.close(code, reason);
                }

                @Override
                public void onClosed(@NonNull WebSocket webSocket, int code, @NonNull String reason) {
                    disconnected(webSocket, code == 4401);
                }

                @Override
                public void onFailure(@NonNull WebSocket webSocket, @NonNull Throwable error, Response response) {
                    Log.w(TAG, "Conexão de alertas interrompida.", error);
                    disconnected(webSocket, false);
                }
            });
        } catch (IllegalArgumentException error) {
            Log.e(TAG, "Endereço de alertas inválido.", error);
        }
    }

    private void handleMessage(WebSocket webSocket, String text) {
        if (stopped || socket != webSocket) return;
        try {
            JSONObject message = new JSONObject(text);
            String type = message.optString("type");
            if ("urgent:offer".equals(type)) {
                String id = message.optString("offerId");
                long expires = message.optLong("expiresAt");
                JSONObject place = message.optJSONObject("place");
                if (place == null || !UrgentOfferWindow.isActive(id, expires, System.currentTimeMillis())) return;
                synchronized (offers) {
                    offers.put(id, message);
                    cancellations.remove(id);
                }
                UrgentNotification.show(context, id, place.optString("name", "Coleta"), expires);
                handler.postDelayed(() -> expire(id, expires), Math.max(0, expires - System.currentTimeMillis()));
                syncActivity(null, 0);
            } else if ("urgent:cancel".equals(type)) {
                cancelNotification(message.optString("offerId"));
            }
        } catch (JSONException error) {
            Log.w(TAG, "Mensagem de alerta inválida.", error);
        }
    }

    private void disconnected(WebSocket closed, boolean invalidSession) {
        handler.post(() -> {
            if (socket != closed) return;
            socket = null;
            if (invalidSession) {
                Log.w(TAG, "Sessão não validada; nova tentativa em 30 segundos.");
            }
            if (!stopped) handler.postDelayed(reconnect, invalidSession ? 30000 : 4000);
        });
    }

    private void expire(String id, long expires) {
        synchronized (offers) {
            JSONObject current = offers.get(id);
            if (current == null || current.optLong("expiresAt") != expires) return;
        }
        cancelNotification(id);
    }

    static void cancel(String id) {
        synchronized (offers) { offers.remove(id); }
    }

    private void cancelNotification(String id) {
        long cancelledExpiry = 0;
        synchronized (offers) {
            JSONObject removed = offers.remove(id);
            long now = System.currentTimeMillis();
            cancellations.entrySet().removeIf(entry -> entry.getValue() + 30000 < now);
            if (removed != null) {
                cancelledExpiry = removed.optLong("expiresAt");
                cancellations.put(id, cancelledExpiry);
            }
        }
        UrgentNotification.cancel(context, id);
        syncActivity(id, cancelledExpiry);
    }

    private void syncActivity(String cancelledId, long cancelledExpiry) {
        Intent intent = new Intent(ACTION_SYNC).setPackage(context.getPackageName());
        if (cancelledId != null && cancelledExpiry > 0) {
            intent.putExtra(UrgentNotification.EXTRA_OFFER_ID, cancelledId);
            intent.putExtra(UrgentNotification.EXTRA_EXPIRES_AT, cancelledExpiry);
        }
        context.sendBroadcast(intent);
    }

    static String activeOffers() {
        JSONArray result = new JSONArray();
        synchronized (offers) {
            Iterator<JSONObject> iterator = offers.values().iterator();
            while (iterator.hasNext()) {
                JSONObject offer = iterator.next();
                if (!UrgentOfferWindow.isActive(offer.optString("offerId"), offer.optLong("expiresAt"), System.currentTimeMillis())) {
                    iterator.remove();
                } else {
                    result.put(offer);
                }
            }
        }
        return result.toString();
    }

    static String cancelledOffers() {
        JSONArray result = new JSONArray();
        synchronized (offers) {
            long now = System.currentTimeMillis();
            Iterator<Map.Entry<String, Long>> iterator = cancellations.entrySet().iterator();
            while (iterator.hasNext()) {
                Map.Entry<String, Long> entry = iterator.next();
                if (entry.getValue() + 30000 < now) {
                    iterator.remove();
                } else {
                    JSONObject item = new JSONObject();
                    try {
                        item.put("offerId", entry.getKey());
                        item.put("expiresAt", entry.getValue());
                        result.put(item);
                    } catch (JSONException error) {
                        Log.e(TAG, "Falha ao sincronizar cancelamento.", error);
                    }
                }
            }
        }
        return result.toString();
    }

    void stop() {
        stopped = true;
        handler.removeCallbacks(reconnect);
        if (socket != null) {
            WebSocket previous = socket;
            socket = null;
            previous.close(1000, "tracking stopped");
        }
        token = null;
        url = null;
        synchronized (offers) {
            for (String id : offers.keySet()) UrgentNotification.cancel(context, id);
            offers.clear();
            cancellations.clear();
        }
        syncActivity(null, 0);
    }
}
