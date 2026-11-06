package com.zapencomendas.app;

import org.junit.Test;
import java.util.List;
import java.util.Set;
import static org.junit.Assert.*;

public class StartupPermissionsTest {
    @Test
    public void requestsOnlyForegroundLocationAtStartupOnAllSupportedVersions() {
        for (int sdk : new int[]{24, 29, 30, 33, 34, 36}) {
            assertEquals(List.of("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"),
                StartupPermissions.missing(sdk, ignored -> false));
        }
    }

    @Test
    public void requestsPreciseAndApproximateTogetherWhenOnlyApproximateIsGranted() {
        Set<String> granted = Set.of("android.permission.ACCESS_COARSE_LOCATION");
        List<String> missing = StartupPermissions.missing(34, granted::contains);
        assertEquals(List.of("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"), missing);
        assertEquals(List.of("android.permission.ACCESS_COARSE_LOCATION"),
            StartupPermissions.missing(34, "android.permission.ACCESS_FINE_LOCATION"::equals));
        assertTrue(StartupPermissions.missing(34, ignored -> true).isEmpty());
    }
}
