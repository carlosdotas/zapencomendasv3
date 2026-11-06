package com.zapencomendas.app;

final class UrgentOfferWindow {
    static final long MAX_DURATION_MS = 60_000L;

    private UrgentOfferWindow() {}

    static boolean isActive(String offerId, long expiresAt, long now) {
        long remaining = expiresAt - now;
        return offerId != null && !offerId.isEmpty() && remaining > 0 && remaining <= MAX_DURATION_MS;
    }
}
