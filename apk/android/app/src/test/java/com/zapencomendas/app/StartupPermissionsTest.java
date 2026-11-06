package com.zapencomendas.app;

import org.junit.Test;
import java.util.List;
import java.util.Set;
import static org.junit.Assert.*;

public class StartupPermissionsTest {
    @Test
    public void selectsPermissionsSupportedByEachAndroidVersion() {
        List<String> old = StartupPermissions.missing(29, ignored -> false);
        assertTrue(old.contains("android.permission.READ_EXTERNAL_STORAGE"));
        assertFalse(old.contains("android.permission.POST_NOTIFICATIONS"));
        assertFalse(old.contains("android.permission.READ_MEDIA_IMAGES"));
        assertTrue(old.contains("android.permission.RECORD_AUDIO"));
        assertFalse(old.contains("android.permission.ACCESS_BACKGROUND_LOCATION"));

        List<String> modern = StartupPermissions.missing(33, ignored -> false);
        assertTrue(modern.contains("android.permission.POST_NOTIFICATIONS"));
        assertTrue(modern.contains("android.permission.READ_MEDIA_IMAGES"));
        assertFalse(modern.contains("android.permission.READ_EXTERNAL_STORAGE"));
        assertFalse(modern.contains("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"));

        List<String> android14 = StartupPermissions.missing(34, ignored -> false);
        assertTrue(android14.contains("android.permission.READ_MEDIA_VISUAL_USER_SELECTED"));
    }

    @Test
    public void avoidsAskingForGrantedOrSelectedPhotosAndRequestsLocationTogether() {
        Set<String> granted = Set.of(
            "android.permission.ACCESS_COARSE_LOCATION",
            "android.permission.CAMERA",
            "android.permission.RECORD_AUDIO",
            "android.permission.READ_CONTACTS",
            "android.permission.POST_NOTIFICATIONS",
            "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
        );
        List<String> missing = StartupPermissions.missing(34, granted::contains);
        assertEquals(List.of("android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION"), missing);
        assertTrue(StartupPermissions.missing(34, ignored -> true).isEmpty());
    }
}
