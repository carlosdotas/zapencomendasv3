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
        return permissions;
    }
}
