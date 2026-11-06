package com.zapencomendas.app;

import static org.junit.Assert.assertEquals;
import org.junit.Test;

public class DriverAlertRequirementsTest {
    @Test
    public void requiresLocationAndBackgroundLocationWhereSupported() {
        assertEquals(DriverAlertRequirements.Missing.LOCATION,
            DriverAlertRequirements.firstMissing(34, false, false, false, false, false));
        assertEquals(DriverAlertRequirements.Missing.BACKGROUND_LOCATION,
            DriverAlertRequirements.firstMissing(29, true, false, true, true, true));
        assertEquals(DriverAlertRequirements.Missing.NONE,
            DriverAlertRequirements.firstMissing(28, true, false, true, true, false));
    }

    @Test
    public void requiresNotificationsAudibleChannelAndFullScreenByVersion() {
        assertEquals(DriverAlertRequirements.Missing.NOTIFICATIONS,
            DriverAlertRequirements.firstMissing(34, true, true, false, false, false));
        assertEquals(DriverAlertRequirements.Missing.CHANNEL,
            DriverAlertRequirements.firstMissing(33, true, true, true, false, false));
        assertEquals(DriverAlertRequirements.Missing.FULL_SCREEN,
            DriverAlertRequirements.firstMissing(34, true, true, true, true, false));
        assertEquals(DriverAlertRequirements.Missing.NONE,
            DriverAlertRequirements.firstMissing(33, true, true, true, true, false));
        assertEquals(DriverAlertRequirements.Missing.NONE,
            DriverAlertRequirements.firstMissing(34, true, true, true, true, true));
    }
}
