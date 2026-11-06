package com.zapencomendas.app;

import org.junit.Test;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

public class UrgentOfferWindowTest {
    @Test
    public void onlyActiveBoundedOffersCanOpenLockScreen() {
        long now = 1_000_000L;
        assertTrue(UrgentOfferWindow.isActive("701_coleta", now + 30_000, now));
        assertFalse(UrgentOfferWindow.isActive("701_coleta", now, now));
        assertFalse(UrgentOfferWindow.isActive("701_coleta", now - 1, now));
        assertFalse(UrgentOfferWindow.isActive("701_coleta", now + 60_001, now));
        assertFalse(UrgentOfferWindow.isActive("", now + 30_000, now));
        assertFalse(UrgentOfferWindow.isActive(null, now + 30_000, now));
    }
}
