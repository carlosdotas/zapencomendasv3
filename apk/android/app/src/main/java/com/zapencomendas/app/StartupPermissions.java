package com.zapencomendas.app;

import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

final class StartupPermissions {
    private StartupPermissions() {}

    static List<String> missing(int sdk, Predicate<String> granted) {
        List<String> permissions = new ArrayList<>();
        String fine = "android.permission.ACCESS_FINE_LOCATION";
        String coarse = "android.permission.ACCESS_COARSE_LOCATION";
        if (!granted.test(fine)) {
            permissions.add(fine);
            permissions.add(coarse);
        } else if (!granted.test(coarse)) {
            permissions.add(coarse);
        }
        addIfMissing(permissions, "android.permission.CAMERA", granted);
        addIfMissing(permissions, "android.permission.RECORD_AUDIO", granted);
        addIfMissing(permissions, "android.permission.READ_CONTACTS", granted);
        if (sdk >= 33) {
            addIfMissing(permissions, "android.permission.POST_NOTIFICATIONS", granted);
            if (!granted.test("android.permission.READ_MEDIA_IMAGES")
                && !(sdk >= 34 && granted.test("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"))) {
                permissions.add("android.permission.READ_MEDIA_IMAGES");
                if (sdk >= 34) permissions.add("android.permission.READ_MEDIA_VISUAL_USER_SELECTED");
            }
        } else {
            addIfMissing(permissions, "android.permission.READ_EXTERNAL_STORAGE", granted);
        }
        return permissions;
    }

    private static void addIfMissing(List<String> permissions, String permission, Predicate<String> granted) {
        if (!granted.test(permission)) permissions.add(permission);
    }
}
