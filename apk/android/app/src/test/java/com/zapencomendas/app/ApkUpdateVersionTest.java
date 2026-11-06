package com.zapencomendas.app;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class ApkUpdateVersionTest {
    @Test
    public void onlyNewerPublishedApkRequiresUpdate() {
        assertTrue(ApkUpdateVersion.isUpdateRequired(3008010, 3009011));
        assertFalse(ApkUpdateVersion.isUpdateRequired(3008010, 3008010));
        assertFalse(ApkUpdateVersion.isUpdateRequired(3009011, 3008010));
        assertFalse(ApkUpdateVersion.isUpdateRequired(3008010, 0));
    }
}
