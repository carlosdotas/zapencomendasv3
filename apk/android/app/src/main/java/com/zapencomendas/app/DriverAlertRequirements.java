package com.zapencomendas.app;

final class DriverAlertRequirements {
    enum Missing {
        LOCATION, BACKGROUND_LOCATION, NOTIFICATIONS, CHANNEL, FULL_SCREEN, NONE
    }

    static Missing firstMissing(int sdk, boolean location, boolean backgroundLocation,
                                boolean notifications, boolean channel, boolean fullScreen) {
        if (!location) return Missing.LOCATION;
        if (sdk >= 29 && !backgroundLocation) return Missing.BACKGROUND_LOCATION;
        if (!notifications) return Missing.NOTIFICATIONS;
        if (sdk >= 26 && !channel) return Missing.CHANNEL;
        if (sdk >= 34 && !fullScreen) return Missing.FULL_SCREEN;
        return Missing.NONE;
    }
}
